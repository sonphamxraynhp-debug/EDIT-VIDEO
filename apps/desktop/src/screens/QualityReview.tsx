import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowLeftRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Download, FileJson, Filter, Hourglass,
  PenLine, RefreshCw, Search, ShieldCheck, Sparkles, X, XCircle,
} from "lucide-react";
import { api, ApiError, fileUrl, useApi } from "../lib/api";
import { dt, VARIANT_STATUS } from "../lib/format";
import { useApp } from "../lib/store";
import { useVariants } from "../components/pickers";
import { Async, Bar, Badge, Btn, Card, Empty, ErrorBox, Kpi, Loading, NeedProject, PageHead, Tabs, Thumb, VariantStatus } from "../components/ui";
import {
  APPROVED_PLUS, BLOCK_EXPLAIN, CompareResult, compareVerdict, Decision, exportQcReport, PctCell, qcChecks, qcWarnings,
  ReasonModal, StatusBadge, StatusIcon, audioStatus, subtitleStatus, thumbOf, useDecide, videoOf,
} from "../components/d_review";

const PAGE = 10;

export default function QualityReview() {
  const { projectId, campaign } = useApp();
  return (
    <>
      <PageHead
        icon={<ShieldCheck size={24} />}
        title="Kiểm định nội dung"
        sub="Rà soát chất lượng, tính khác biệt, độ chính xác thông tin và quyền sử dụng trước khi xuất bản"
      />
      <div className="warn-box row semi mb12" style={{ gap: 10 }}>
        <AlertTriangle size={17} />
        Đánh giá nội bộ không bảo đảm việc phân phối hoặc phê duyệt trên nền tảng
      </div>
      <NeedProject projectId={projectId}>
        {campaign ? <QualityBody /> : <Loading rows={4} h={20} />}
      </NeedProject>
    </>
  );
}

function QualityBody() {
  const nav = useNavigate();
  const { toast } = useApp();
  const q = useVariants(undefined, 8000);
  const [angle, setAngle] = useState("");
  const [status, setStatus] = useState("");
  const [sev, setSev] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ decision: Decision; ids: string[] } | null>(null);
  const { decide, bulk, lastError, clearError } = useDecide(() => q.reload());

  const items: any[] = q.data?.items || [];
  const counts = useMemo(() => {
    const c = { pending: 0, ready: 0, revise: 0, rejected: 0 };
    for (const v of items) {
      if (v.status === "QC_PENDING") c.pending++;
      else if (APPROVED_PLUS.includes(v.status)) c.ready++;
      else if (v.status === "NEEDS_REVISION") c.revise++;
      else if (v.status === "REJECTED") c.rejected++;
    }
    return c;
  }, [items]);
  const angles = useMemo(() => Array.from(new Map(items.map((v) => [v.concept_json?.angle, v.angle_label])).entries()), [items]);

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    return items.filter((v) => {
      if (angle && v.concept_json?.angle !== angle) return false;
      if (status === "APPROVED+" ? !APPROVED_PLUS.includes(v.status) : status && v.status !== status) return false;
      if (sev === "none" ? !!v.qc : sev && v.qc?.severity !== sev) return false;
      if (t && !`${v.code} ${v.script?.title || ""} ${v.script?.hook || ""} ${v.angle_label}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [items, angle, status, sev, text]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageItems = filtered.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => { if (page > pages) setPage(1); }, [pages, page]);

  // Chọn biến thể đầu tiên có QC chờ duyệt
  useEffect(() => {
    if (!items.length) return;
    if (!activeId || !items.some((v) => v.id === activeId)) setActiveId((items.find((v) => v.status === "QC_PENDING") || items.find((v) => v.qc) || items[0]).id);
  }, [items, activeId]);
  const active = items.find((v) => v.id === activeId);
  const selIds = Array.from(sel).filter((id) => items.some((v) => v.id === id));
  const selItems = items.filter((v) => sel.has(v.id));

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = pageItems.length > 0 && pageItems.every((v) => sel.has(v.id));

  return (
    <>
      <div className="grid g4 mb12">
        <Kpi icon={<Hourglass size={22} />} value={counts.pending} label="Đang chờ" />
        <Kpi icon={<CheckCircle2 size={22} />} value={counts.ready} label="Sẵn sàng" tone="teal" />
        <Kpi icon={<PenLine size={22} />} value={counts.revise} label="Cần chỉnh sửa" tone="orange" />
        <Kpi icon={<XCircle size={22} />} value={counts.rejected} label="Bị từ chối" tone="red" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 360px", alignItems: "start" }}>
        <div className="col" style={{ gap: 16, minWidth: 0 }}>
          {/* Bộ lọc */}
          <div className="row wrap" style={{ gap: 10 }}>
            <FilterSel label="Góc nội dung" value={angle} onChange={(v) => { setAngle(v); setPage(1); }} options={[["", "Tất cả"], ...angles.map(([k, l]) => [k, l] as [string, string])]} />
            <FilterSel
              label="Trạng thái"
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[["", "Tất cả"], ["QC_PENDING", "Đang chờ"], ["APPROVED+", "Sẵn sàng"], ["NEEDS_REVISION", "Cần chỉnh sửa"], ["REJECTED", "Bị từ chối"], ...Object.keys(VARIANT_STATUS).filter((k) => !["QC_PENDING", "NEEDS_REVISION", "REJECTED"].includes(k)).map((k) => [k, VARIANT_STATUS[k].label] as [string, string])]}
            />
            <FilterSel label="Mức QC" value={sev} onChange={(v) => { setSev(v); setPage(1); }} options={[["", "Tất cả"], ["ok", "Đạt"], ["warning", "Cảnh báo"], ["critical", "Nghiêm trọng"], ["none", "Chưa QC"]]} />
            <div className="search grow" style={{ maxWidth: "none", marginLeft: 0, minWidth: 200 }}>
              <Search size={15} />
              <input placeholder="Tìm mã variant, tiêu đề, hook…" value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} />
            </div>
            <button className="btn icon" title="Xoá bộ lọc" onClick={() => { setAngle(""); setStatus(""); setSev(""); setText(""); }}><Filter size={15} /></button>
          </div>

          {/* Bảng biến thể */}
          <div className="card" style={{ padding: 0 }}>
            <Async q={q} empty={(d) => d.items.length === 0 && (
              <div style={{ padding: 16 }}>
                <Empty title="Chưa có biến thể nào" action={<button className="btn primary" onClick={() => nav("/creative/matrix")}>Lập ma trận sáng tạo</button>}>
                  Tạo biến thể, kịch bản và render preview để QC tự động chạy.
                </Empty>
              </div>
            )}>
              {() => (
                <>
                  <div className="table-wrap" style={{ border: 0, borderRadius: "14px 14px 0 0" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}>
                            <input type="checkbox" className="check" checked={allOnPage} onChange={() => setSel((s) => { const n = new Set(s); pageItems.forEach((v) => (allOnPage ? n.delete(v.id) : n.add(v.id))); return n; })} aria-label="Chọn trang" />
                          </th>
                          <th>Variant</th>
                          <th className="center" title="Độ giống kịch bản với biến thể gần nhất">Script<br />Similarity</th>
                          <th className="center" title="Cùng thứ tự cảnh với một biến thể khác">Storyline</th>
                          <th className="center" title="Tỷ lệ cảnh quay dùng chung lớn nhất">Visual<br />Source Reuse</th>
                          <th className="center">Claim<br />Evidence</th>
                          <th className="center">Audio<br />QC</th>
                          <th className="center">Subtitle<br />QC</th>
                          <th className="center">Rights</th>
                          <th>Quyết định</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.length === 0 && (
                          <tr><td colSpan={10} className="center muted" style={{ padding: 24 }}>Không có biến thể khớp bộ lọc.</td></tr>
                        )}
                        {pageItems.map((v) => {
                          const c = qcChecks(v);
                          return (
                            <tr key={v.id} className={v.id === activeId ? "sel" : ""} style={{ cursor: "pointer" }} onClick={() => { setActiveId(v.id); clearError(); }}>
                              <td onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" className="check" checked={sel.has(v.id)} onChange={() => toggle(v.id)} aria-label={`Chọn ${v.code}`} />
                              </td>
                              <td>
                                <div className="row">
                                  <Thumb src={thumbOf(v)} ratio="1/1" style={{ width: 46, flexShrink: 0 }} />
                                  <div style={{ minWidth: 0 }}>
                                    <div className="semi">{v.code}</div>
                                    <div className="xs t2 ellipsis" style={{ maxWidth: 190 }}>{v.script?.title || v.script?.hook || "Chưa có kịch bản"}</div>
                                    <div className="xs muted">{v.angle_label}</div>
                                  </div>
                                </div>
                              </td>
                              {c ? (
                                <>
                                  <td className="center"><PctCell v={c.script_similarity?.value} /></td>
                                  <td className="center">
                                    {c.visual_reuse ? (c.visual_reuse.same_order ? <Badge tone="red">Trùng</Badge> : <Badge tone="teal">Khác</Badge>) : <span className="xs muted">N/A</span>}
                                  </td>
                                  <td className="center"><PctCell v={c.visual_reuse?.value} warn={0.5} bad={0.71} /></td>
                                  <td className="center"><StatusBadge s={c.claim?.status} label={c.claim?.status === "warn" ? "Cần bổ sung" : undefined} /></td>
                                  <td className="center"><StatusBadge s={audioStatus(c)} label={audioStatus(c) === "pass" ? "Tốt" : undefined} /></td>
                                  <td className="center"><StatusBadge s={subtitleStatus(c)} label={subtitleStatus(c) === "pass" ? "Tốt" : undefined} /></td>
                                  <td className="center"><StatusBadge s={c.rights?.status} label={c.rights?.status === "pass" ? "Hợp lệ" : undefined} /></td>
                                </>
                              ) : (
                                <td colSpan={7} className="center xs muted">Chưa có báo cáo QC – cần render preview</td>
                              )}
                              <td><VariantStatus status={v.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="row wrap" style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", gap: 8 }}>
                    <span className="small t2">
                      Đã chọn: <b>{selIds.length}</b> {selItems.length > 0 && selItems.length <= 3 ? `(${selItems.map((v) => v.code).join(", ")})` : ""}
                    </span>
                    <Btn size="sm" kind="primary" icon={<Check size={14} />} disabled={!selIds.length} title={!selIds.length ? "Chọn biến thể trước" : undefined} onClick={() => bulk(selIds, "accept").then((r) => r && setSel(new Set()))}>Phê duyệt</Btn>
                    <Btn size="sm" kind="orange" icon={<PenLine size={14} />} disabled={!selIds.length} onClick={() => setReasonFor({ decision: "revise", ids: selIds })}>Gửi chỉnh sửa</Btn>
                    <Btn size="sm" kind="danger" icon={<X size={14} />} disabled={!selIds.length} onClick={() => setReasonFor({ decision: "reject", ids: selIds })}>Từ chối</Btn>
                    <Btn size="sm" icon={<Download size={14} />} onClick={() => exportQcReport(selItems.length ? selItems : filtered, "csv")} title="Xuất báo cáo kiểm định (CSV) – các biến thể đã chọn hoặc toàn bộ danh sách lọc">Xuất báo cáo CSV</Btn>
                    <Btn size="sm" kind="ghost" icon={<FileJson size={14} />} onClick={() => exportQcReport(selItems.length ? selItems : filtered, "json")}>JSON</Btn>
                    <div className="row" style={{ marginLeft: "auto", gap: 4 }}>
                      <button className="btn xs ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={14} /></button>
                      {Array.from({ length: pages }).slice(0, 7).map((_, i) => (
                        <button key={i} className={`btn xs ${page === i + 1 ? "primary" : "ghost"}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
                      ))}
                      {pages > 7 && <span className="xs muted">… {pages}</span>}
                      <button className="btn xs ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={14} /></button>
                    </div>
                  </div>
                </>
              )}
            </Async>
          </div>

          <CompareSection items={items} defaultA={activeId} />
        </div>

        <DetailPanel
          v={active}
          lastError={lastError}
          onDecide={(d) => (d === "accept" ? decide(active!.id, "accept") : Promise.resolve(setReasonFor({ decision: d, ids: [active!.id] })))}
          onRerun={async () => {
            const r = await api.post(`/variants/${active!.id}/qc`);
            toast({ kind: r?.severity === "critical" ? "warn" : "success", title: `Đã chạy lại QC ${active!.code}`, body: `Mức: ${r?.severity === "critical" ? "Nghiêm trọng" : r?.severity === "warning" ? "Cảnh báo" : "Đạt"}` });
            q.reload();
            return true;
          }}
        />
      </div>

      <ReasonModal
        open={!!reasonFor}
        decision={reasonFor?.decision || null}
        count={reasonFor?.ids.length || 0}
        onClose={() => setReasonFor(null)}
        onSubmit={async (reason) => {
          if (!reasonFor) return;
          if (reasonFor.ids.length === 1) return decide(reasonFor.ids[0], reasonFor.decision, reason);
          const r = await bulk(reasonFor.ids, reasonFor.decision, reason);
          if (r) setSel(new Set());
          return r;
        }}
      />
    </>
  );
}

function FilterSel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="row" style={{ gap: 6, background: "rgba(9,14,34,.7)", border: "1px solid var(--border-2)", borderRadius: 9, padding: "0 4px 0 10px", height: 36 }}>
      <span className="xs muted" style={{ whiteSpace: "nowrap" }}>{label}:</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, height: 32, background: "transparent", paddingLeft: 2, minWidth: 110 }}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function DetailPanel({ v, lastError, onDecide, onRerun }: { v: any; lastError: ApiError | null; onDecide: (d: Decision) => Promise<unknown>; onRerun: () => Promise<unknown> }) {
  const { toastError } = useApp();
  const [tab, setTab] = useState("ai");
  const detail = useApi<any>(v ? `/variants/${v.id}` : null);
  useEffect(() => { detail.reload(); /* làm mới khi trạng thái đổi */ }, [v?.status, v?.qc?.severity]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v)
    return (
      <Card title="Chi tiết kiểm định">
        <div className="small muted">Chọn một biến thể trong bảng.</div>
      </Card>
    );
  const c = qcChecks(v);
  const vid = videoOf(v);
  const warns = qcWarnings(c);
  const critical = c && (c.claim?.status === "fail" || c.rights?.status === "fail" || c.policy?.status === "fail" || c.originality?.status === "fail");
  const canApprove = v.status === "QC_PENDING";
  const blockedTitle = !canApprove ? `Chỉ duyệt được khi trạng thái “Chờ kiểm duyệt” (hiện: ${VARIANT_STATUS[v.status]?.label || v.status})` : critical ? "Bị chặn: lỗi claim/quyền tư liệu nghiêm trọng (BLOCK-01/02/04/05)" : undefined;
  const canRevise = ["QC_PENDING", "APPROVED", "COMPLETED", "SCRIPT_READY", "SCRIPT_APPROVED", "STORYBOARD_READY", "REJECTED", "FAILED"].includes(v.status);
  const canReject = ["QC_PENDING", "DRAFT", "SCRIPT_READY", "NEEDS_REVISION"].includes(v.status);
  const hasPreview = !!(v.status !== "DRAFT" && (vid.src || ["PREVIEW_READY", "QC_PENDING"].includes(v.status)));
  const claimIds: string[] = Array.from(new Set((detail.data?.script_full?.beats_json?.beats || []).flatMap((b: any) => b.claim_ids || [])));

  return (
    <div className="card" style={{ position: "sticky", top: 0 }}>
      <div className="card-title mb12">Chi tiết kiểm định: {v.code}</div>
      {vid.src ? (
        <video key={vid.src} className="video-player" controls preload="metadata" poster={fileUrl(thumbOf(v)) || undefined} src={fileUrl(vid.src)} style={{ maxHeight: 300, objectFit: "contain" }} />
      ) : (
        <Thumb src={null} ratio="16/10" label={<Badge>Chưa có preview</Badge>} />
      )}
      <div className="row between mt8 small">
        <span className="t2 ellipsis">{v.script?.title || "—"}</span>
        <VariantStatus status={v.status} />
      </div>
      {vid.kind && <div className="xs muted">{vid.kind === "final" ? "Bản final đã render" : "Bản preview dùng cho QC"}</div>}

      <div className="mt12">
        <Tabs
          tabs={[{ id: "ai", label: "Kết quả AI" }, { id: "src", label: "Nguồn & chứng cứ" }, { id: "notes", label: `Ghi chú (${detail.data?.approvals?.length ?? 0})` }]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "ai" && (
        <>
          {!c ? (
            <Empty title="Chưa có báo cáo QC">Render preview trong Sản xuất; QC chạy tự động sau preview.</Empty>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              <div className="card-title" style={{ fontSize: 13 }}><Sparkles size={14} className="c-primary" /> Phân tích tự động</div>
              <CheckRow title="Tính khác biệt nội dung" sub={`Kịch bản giống nhất ${Math.round((c.script_similarity?.value || 0) * 100)}% · tái dùng cảnh ${Math.round((c.visual_reuse?.value || 0) * 100)}%`} s={c.script_similarity?.status === "warn" || c.visual_reuse?.status === "warn" ? "warn" : "pass"} />
              <CheckRow title="Độ chính xác thông tin" sub={`${c.claim?.flags?.length || 0} cờ claim trong kịch bản`} s={c.claim?.status} />
              <CheckRow title="Chất lượng kỹ thuật" sub={c.technical ? `Đen ${c.technical.black_frames?.length || 0} · đứng hình ${c.technical.frozen_frames?.length || 0} · peak ${c.technical.audio?.peak_db ?? "—"} dB` : "Chưa có (cần preview)"} s={c.technical?.status} />
              <CheckRow title="Footage đủ cho kịch bản" sub={`${c.footage?.gaps?.length || 0} khoảng thiếu cảnh`} s={c.footage?.status} />
              {c.policy && <CheckRow title="Chính sách quảng cáo (Meta/TikTok)" sub={`${c.policy.flags?.length || 0} cờ chính sách${c.policy.status === "fail" ? " · chặn, không thể miễn trừ (BLOCK-05)" : ""}`} s={c.policy.status} />}
              {c.originality && <CheckRow title="Điểm nguyên bản (hình + tiếng + chữ)" sub={`${Math.round((c.originality.score || 0) * 100)}% (tối thiểu ${Math.round((c.originality.min || 0) * 100)}%)${c.originality.status === "fail" ? " · chặn (BLOCK-04)" : ""}`} s={c.originality.status} />}
              {c.safe_zone && <CheckRow title="Vùng an toàn TikTok" sub={c.safe_zone.message || `${c.safe_zone.tiktok_ui_overlap ?? 0} chỗ chữ chồng lên UI TikTok`} s={c.safe_zone.status} />}
              {c.music_license && <CheckRow title="Bản quyền nhạc" sub={c.music_license.message || c.music_license.file || "—"} s={c.music_license.status} />}
              <CheckRow title="Quyền sử dụng tư liệu" sub={c.rights?.assets?.length ? `${c.rights.assets.length} tư liệu chưa rõ quyền` : "Tất cả tư liệu đã có quyền"} s={c.rights?.status} />
              {c.policy && <PolicyDetail p={c.policy} />}
              {c.originality && <OriginalityDetail o={c.originality} />}
              <div className="xs muted">Mức tổng: <b>{v.qc?.severity === "critical" ? "Nghiêm trọng" : v.qc?.severity === "warning" ? "Cảnh báo" : "Đạt"}</b>{v.qc?.decision ? ` · Quyết định QC: ${v.qc.decision}` : ""}</div>
            </div>
          )}
        </>
      )}

      {tab === "src" && (
        <div className="col" style={{ gap: 10 }}>
          <div className="small semi">Claim được dẫn trong kịch bản</div>
          {detail.loading && !detail.data ? <Loading rows={2} /> : claimIds.length ? (
            <div className="small t2">{claimIds.length} claim được gắn vào beat kịch bản (xem chi tiết tại Product Brain).</div>
          ) : <div className="xs muted">Kịch bản không gắn claim nào.</div>}
          {(c?.claim?.flags || []).map((f: any, i: number) => (
            <div key={i} className="row small" style={{ alignItems: "flex-start" }}><StatusIcon s={f.severity === "critical" ? "fail" : "warn"} /><span>[{f.code}] Beat {f.beat + 1}: {f.message}</span></div>
          ))}
          <div className="divider" style={{ margin: "4px 0" }} />
          <div className="small semi">Quyền tư liệu</div>
          {c?.rights?.assets?.length ? c.rights.assets.map((a: any) => (
            <div key={a.file_name} className="row small"><StatusIcon s="fail" />{a.file_name} <Badge tone="red">{a.rights}</Badge></div>
          )) : <div className="row small"><StatusIcon s={c?.rights ? "pass" : undefined} />{c?.rights ? "Không có tư liệu thiếu quyền" : "N/A"}</div>}
          <div className="small semi">Khoảng thiếu footage</div>
          {c?.footage?.gaps?.length ? c.footage.gaps.map((g: any, i: number) => (
            <div key={i} className="row small"><StatusIcon s={g.code === "BLOCK-03" ? "fail" : "warn"} />Beat {g.beat + 1}: {g.message}</div>
          )) : <div className="xs muted">{c?.footage ? "Đủ cảnh cho mọi beat." : "N/A"}</div>}
        </div>
      )}

      {tab === "notes" && (
        <div className="col" style={{ gap: 8 }}>
          {detail.error && <ErrorBox error={detail.error} onRetry={detail.reload} />}
          {(detail.data?.approvals || []).length === 0 && <div className="xs muted">Chưa có ghi chú / lịch sử duyệt.</div>}
          {(detail.data?.approvals || []).map((a: any) => (
            <div key={a.id} className="inner" style={{ padding: 9 }}>
              <div className="row between xs"><VariantStatus status={a.decision} /><span className="muted">{dt(a.at)}</span></div>
              {a.reason && <div className="small t2 mt8">{a.reason}</div>}
              <div className="xs muted">bởi {a.reviewer_id || "—"}</div>
            </div>
          ))}
        </div>
      )}

      {warns.length > 0 && (
        <div className="warn-box small mt12">
          <div className="row semi"><AlertTriangle size={14} /> Cảnh báo / Lưu ý ({warns.length})</div>
          <div className="col mt8" style={{ gap: 4 }}>
            {warns.slice(0, 6).map((w, i) => <div key={i} className="row xs" style={{ alignItems: "flex-start", color: "#f3d9a8" }}><StatusIcon s={w.s} size={12} />{w.text}</div>)}
          </div>
        </div>
      )}

      {lastError && (
        <div className="mt12">
          <ErrorBox error={lastError} />
          {BLOCK_EXPLAIN[lastError.body.code] && <div className="xs t2 mt8">{BLOCK_EXPLAIN[lastError.body.code]}</div>}
        </div>
      )}

      <div className="grid g2 mt12" style={{ gap: 8 }}>
        <Btn kind="primary" size="sm" icon={<Check size={14} />} disabled={!canApprove || !!critical} title={blockedTitle} onClick={() => onDecide("accept")}>Phê duyệt</Btn>
        <Btn kind="orange" size="sm" icon={<PenLine size={14} />} disabled={!canRevise} title={!canRevise ? "Trạng thái hiện tại không cho gửi chỉnh sửa" : undefined} onClick={() => onDecide("revise")}>Gửi chỉnh sửa</Btn>
        <Btn kind="danger" size="sm" icon={<X size={14} />} disabled={!canReject} title={!canReject ? "Trạng thái hiện tại không cho từ chối" : undefined} onClick={() => onDecide("reject")}>Từ chối</Btn>
        <Btn size="sm" icon={<ShieldCheck size={14} />} disabled={!canApprove || !!critical} title={!canApprove ? blockedTitle : critical ? "Lỗi claim/quyền tư liệu không thể miễn trừ" : "Duyệt kèm lý do khi QC còn lỗi kỹ thuật/footage"} onClick={() => onDecide("waive")}>Miễn trừ có lý do</Btn>
      </div>
      <Btn
        size="sm"
        kind="ghost"
        className="mt8"
        icon={<RefreshCw size={14} />}
        disabled={!hasPreview}
        title={!hasPreview ? "Cần render preview trước khi chạy QC" : "Chạy lại toàn bộ kiểm tra QC trên preview mới nhất"}
        onClick={() => onRerun().catch((e) => { toastError(e, "Không chạy lại được QC"); })}
      >
        Chạy lại QC
      </Btn>

      <div className="divider" />
      <div className="small semi mb8">Giải thích cờ (Flag)</div>
      <div className="col xs t2" style={{ gap: 6 }}>
        <div className="row"><StatusIcon s="pass" size={13} /><b>Tốt / Đạt</b>: đáp ứng tiêu chí kiểm định</div>
        <div className="row"><StatusIcon s="warn" size={13} /><b>Cần bổ sung</b>: thiếu chứng cứ hoặc cần người xem lại</div>
        <div className="row"><StatusIcon s="fail" size={13} /><b>Không đạt</b>: claim sai/bị cấm, thiếu quyền hoặc lỗi kỹ thuật – chặn duyệt</div>
      </div>
    </div>
  );
}

function PolicyDetail({ p }: { p: any }) {
  const flags: any[] = p.flags || [];
  return (
    <div className="inner col" style={{ padding: "8px 10px", gap: 6 }}>
      <div className="row between">
        <span className="small semi">Chính sách quảng cáo (Meta/TikTok)</span>
        <StatusBadge s={p.status} />
      </div>
      {(p.industry || p.platforms?.length) && (
        <div className="row wrap xs muted" style={{ gap: 4 }}>
          {p.industry && <span>Ngành: {p.industry}</span>}
          {(p.platforms || []).map((pf: string) => <Badge key={pf} tone="gray">{pf}</Badge>)}
        </div>
      )}
      {p.status === "fail" && <div className="err-box xs">Vi phạm chính sách là lỗi chặn (BLOCK-05), không thể miễn trừ. Sửa nội dung rồi chạy lại QC.</div>}
      {flags.length === 0 && <div className="xs muted">Không có cờ chính sách.</div>}
      {flags.map((f, i) => (
        <div key={i} className="col" style={{ gap: 3 }}>
          <div className="row xs wrap" style={{ alignItems: "flex-start", gap: 6 }}>
            <Badge tone="gray">Beat {(f.beat ?? 0) + 1}</Badge>
            <Badge tone={f.severity === "critical" || f.severity === "fail" ? "red" : "orange"}>{f.severity}</Badge>
            <span className="mono muted">{f.code}</span>
            {(f.platforms || []).map((pf: string) => <Badge key={pf} tone="purple">{pf}</Badge>)}
          </div>
          <div className="small">{f.message}</div>
          {f.ref && <div className="xs muted">{f.ref}</div>}
        </div>
      ))}
    </div>
  );
}

function OriginalityDetail({ o }: { o: any }) {
  const pct = Math.round((o.score || 0) * 100);
  const subs: Array<[string, number | undefined]> = [["Chữ", o.text], ["Hook", o.hook], ["Hình", o.visual], ["Tiếng", o.audio]];
  return (
    <div className="inner col" style={{ padding: "8px 10px", gap: 6 }}>
      <div className="row between">
        <span className="small semi">Điểm nguyên bản (hình + tiếng + chữ)</span>
        <StatusBadge s={o.status} />
      </div>
      <div className="row">
        <b>{pct}%</b>
        <div className="grow"><Bar value={pct} tone={o.status === "fail" ? "red" : o.status === "warn" ? "orange" : "teal"} thin /></div>
        <span className="xs muted">tối thiểu {Math.round((o.min || 0) * 100)}%</span>
      </div>
      {o.nearest && <div className="xs muted">so với bản gần nhất {String(o.nearest).slice(0, 8)}</div>}
      <div className="row wrap" style={{ gap: 4 }}>
        {subs.map(([l, v]) => v !== undefined && v !== null && <Badge key={l} tone="gray">{l}: giống {Math.round(v * 100)}%</Badge>)}
      </div>
      {o.status === "fail" && <div className="err-box xs">Điểm nguyên bản quá thấp (BLOCK-04), không thể miễn trừ. Hãy đổi hook / cảnh / giọng đọc rồi chạy lại QC.</div>}
    </div>
  );
}

function CheckRow({ title, sub, s }: { title: string; sub: string; s?: string }) {
  return (
    <div className="inner row" style={{ padding: "8px 10px" }}>
      <StatusIcon s={s} size={16} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small semi">{title}</div>
        <div className="xs muted ellipsis">{sub}</div>
      </div>
      <StatusBadge s={s || null} />
    </div>
  );
}

function CompareSection({ items, defaultA }: { items: any[]; defaultA: string | null }) {
  const withScript = items.filter((v) => v.script);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  useEffect(() => {
    if (!withScript.length) return;
    const va = a && withScript.some((v) => v.id === a) ? a : (defaultA && withScript.some((v) => v.id === defaultA) ? defaultA : withScript[0].id);
    if (va !== a) setA(va);
    if (!b || b === va || !withScript.some((v) => v.id === b)) {
      const near = withScript.find((v) => v.id === withScript.find((x) => x.id === va)?.uniqueness_json?.nearest);
      const pick = near || withScript.find((v) => v.id !== va);
      if (pick && pick.id !== b) setB(pick.id);
    }
  }, [withScript.length, defaultA]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmp = useApi<any>(a && b && a !== b ? "/variants/compare" : null, { a, b });
  const va = items.find((v) => v.id === a);
  const vb = items.find((v) => v.id === b);
  const verdict = cmp.data ? compareVerdict(cmp.data) : null;

  return (
    <Card title="So sánh biến thể: Variant A vs Variant B" icon={<ArrowLeftRight size={16} className="c-primary" />} sub="Dựa trên kịch bản, hook, cấu trúc beat và cảnh quay thực tế">
      {withScript.length < 2 ? (
        <Empty title="Cần ít nhất 2 biến thể có kịch bản để so sánh" />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr) minmax(0,.8fr)", gap: 14 }}>
          <div className="row" style={{ alignItems: "stretch", gap: 8 }}>
            <VariantPick label="Variant A" v={va} value={a} items={withScript} onChange={setA} accent />
            <button className="btn icon" style={{ alignSelf: "center" }} title="Đổi chỗ A/B" onClick={() => { setA(b); setB(a); }}><ArrowLeftRight size={15} /></button>
            <VariantPick label="Variant B" v={vb} value={b} items={withScript} onChange={setB} />
          </div>
          <div>
            <div className="small semi mb8">Kết quả so sánh (nội bộ)</div>
            {a === b ? <div className="xs muted">Chọn hai biến thể khác nhau.</div> : (
              <Async q={cmp}>{(r) => <CompareResult r={r} />}</Async>
            )}
          </div>
          <div>
            <div className="small semi mb8">Nhận định</div>
            {verdict ? (
              <div className={verdict.tone === "teal" ? "info-box small" : "err-box small"} style={verdict.tone === "orange" ? { borderColor: "rgba(245,165,36,.55)", background: "rgba(245,165,36,.08)" } : undefined}>
                {verdict.text}
              </div>
            ) : <div className="xs muted">—</div>}
          </div>
        </div>
      )}
    </Card>
  );
}

function VariantPick({ label, v, value, items, onChange, accent }: { label: string; v: any; value: string; items: any[]; onChange: (id: string) => void; accent?: boolean }) {
  return (
    <div className={`inner col grow`} style={{ gap: 8, borderColor: accent ? "var(--teal)" : undefined, minWidth: 0 }}>
      <div className="row" style={{ gap: 8 }}>
        <Thumb src={thumbOf(v)} ratio="3/4" style={{ width: 54, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div className="semi small">{label}</div>
          <div className="xs muted">{v?.code}</div>
          <div className="xs t2 ellipsis">{v?.angle_label}</div>
        </div>
      </div>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 32 }}>
        {items.map((x) => <option key={x.id} value={x.id}>{x.code} – {x.angle_label}</option>)}
      </select>
      <div className="xs t2" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v?.script?.title || "—"}</div>
    </div>
  );
}
