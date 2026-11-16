import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen, Bot, Check, CheckCircle2, Clock, Cpu, FileText, GitCompare, History, Layers, Mic, Package, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Sparkles, Trash2, Type, Users, X, Clapperboard,
} from "lucide-react";
import { api, ApiError, useApi } from "../lib/api";
import { CLAIM_STATUS, SHOT_TAGS, dt } from "../lib/format";
import { useApp } from "../lib/store";
import { Async, Badge, Btn, Card, Empty, ErrorBox, Loading, Modal, NeedProject, PageHead, Tabs, Thumb, VariantStatus, Warn } from "../components/ui";
import { Ring } from "../components/charts";
import { useSelectedVariant, useVariants } from "../components/pickers";
import { BEAT_META, sec } from "../components/b_creative";

const SCRIPT_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "Bản nháp", tone: "orange" },
  blocked: { label: "Bị chặn claim", tone: "red" },
  approved: { label: "Approved", tone: "teal" },
};
const CAN_STORYBOARD = ["SCRIPT_APPROVED", "STORYBOARD_READY", "PREVIEW_READY", "FAILED", "NEEDS_REVISION"];
const words = (t: string) => (t || "").trim().split(/\s+/).filter(Boolean);

export default function ScriptStudio() {
  const { projectId, campaign } = useApp();
  const nav = useNavigate();
  const all = useVariants(undefined, 6000);
  const items = all.data?.items;
  return (
    <NeedProject projectId={projectId}>
      <PageHead title="Nhà máy kịch bản" icon={<FileText size={22} />} sub="Tạo, biên tập và chuẩn hoá kịch bản video từ Product Brain, kèm kiểm chứng thông tin và tối ưu hiệu quả nội dung." />
      {!campaign ? (
        <Empty title="Chưa có chiến dịch" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Thiết lập chiến lược</Btn>} />
      ) : (
        <Async q={all} empty={(d) => d.items.length === 0 && (
          <Empty title="Chưa có ý tưởng / biến thể nào" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Đi tới Chiến lược nội dung</Btn>}>
            Lập chiến lược và ma trận sáng tạo để có danh sách ý tưởng cần viết kịch bản.
          </Empty>
        )}>
          {() => <Studio items={items!} reloadList={all.reload} />}
        </Async>
      )}
    </NeedProject>
  );
}

function Studio({ items, reloadList }: { items: any[]; reloadList: () => void }) {
  const nav = useNavigate();
  const { product, toast, toastError } = useApp();
  const [sp, setSp] = useSearchParams();
  const { id, select } = useSelectedVariant(items, (v) => !!v.script);
  const vq = useApi<any>(id ? `/variants/${id}` : null, undefined, 10000);
  const hq = useApi<any[]>(id ? `/variants/${id}/scripts` : null);
  const pq = useApi<any>(product ? `/products/${product.id}` : null);
  const settings = useApi<any>("/settings");
  const scenesQ = useApi<any[]>(vq.data?.campaign?.project_id ? "/scenes" : null, { project_id: vq.data?.campaign?.project_id });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("script");
  const [edit, setEdit] = useState<null | { title: string; beats: any[] }>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [approveErr, setApproveErr] = useState<ApiError | null>(null);

  useEffect(() => { setEdit(null); setApproveErr(null); }, [id]);

  const v = vq.data;
  const s = v?.script_full;
  const beats: any[] = s?.beats_json?.beats || [];
  const flags: any[] = s?.beats_json?.flags || [];
  const claimsById = useMemo(() => Object.fromEntries((pq.data?.claims || []).map((c: any) => [c.id, c])), [pq.data]);
  const evidenceById = useMemo(() => Object.fromEntries((pq.data?.evidence || []).map((e: any) => [e.id, e])), [pq.data]);
  const scenesById = useMemo(() => Object.fromEntries((scenesQ.data || []).map((x: any) => [x.id, x])), [scenesQ.data]);
  const citations = useMemo(() => Array.from(new Set(beats.flatMap((b) => b.claim_ids || []))), [beats]);
  const byId = Object.fromEntries(items.map((x) => [x.id, x]));

  const list = items.filter((x) => {
    if (!search) return true;
    const t = `${x.code} ${x.angle_label} ${x.audience_label} ${x.script?.title || ""} ${x.script?.hook || ""}`.toLowerCase();
    return t.includes(search.toLowerCase());
  });

  const reloadAll = () => { vq.reload(); hq.reload(); reloadList(); };

  async function regenerate() {
    if (!id) return;
    setGenBusy(true);
    try {
      const r = await api.post(`/variants/${id}/script`, undefined, { sync: true, use_llm: true });
      toast({ kind: r.engine?.startsWith("ollama") ? "success" : "warn", title: `Đã tạo phiên bản v${r.version}`, body: r.engine?.startsWith("ollama") ? `Engine ${r.engine}` : "LLM không khả dụng/không đạt schema — dùng template engine" });
      reloadAll();
    } catch (e) {
      toastError(e, "Không tạo được kịch bản mới");
    } finally {
      setGenBusy(false);
    }
  }

  async function approve() {
    setApproveErr(null);
    try {
      await api.post(`/variants/${id}/script/approve`);
      toast({ kind: "success", title: "Đã duyệt kịch bản" });
      reloadAll();
      return true;
    } catch (e) {
      const err = e as ApiError;
      setApproveErr(err);
      toastError(err, err.body.code === "BLOCK-01" ? "BLOCK-01: còn claim chưa được chứng minh" : "Không duyệt được");
    }
  }

  async function storyboard() {
    try {
      await api.post(`/variants/${id}/storyboard`);
      toast({ kind: "success", title: "Đã dựng storyboard" });
      reloadList();
      nav(`/creative/storyboard?v=${id}`);
    } catch (e) {
      toastError(e, "Không dựng được storyboard");
    }
  }

  async function saveEdit() {
    if (!edit) return;
    const clean = edit.beats.filter((b) => (b.text || "").trim());
    if (clean.length < 2) { toast({ kind: "warn", title: "Kịch bản cần ít nhất 2 beat có lời thoại" }); return; }
    try {
      const r = await api.put(`/variants/${id}/script`, { title: edit.title, beats: clean });
      const crit = (r.beats_json.flags || []).filter((f: any) => f.severity === "critical").length;
      toast({ kind: crit ? "warn" : "success", title: `Đã lưu phiên bản v${r.version}`, body: crit ? `${crit} cờ BLOCK-01 cần xử lý trước khi duyệt` : undefined });
      setEdit(null);
      reloadAll();
      return true;
    } catch (e) {
      toastError(e, "Không lưu được kịch bản");
    }
  }

  const duration = v?.concept_json?.duration;
  const est = s?.beats_json?.est_seconds;
  const totalWords = beats.reduce((a, b) => a + words(b.text).length, 0);
  const inLimit = est !== undefined && duration ? est <= duration * 1.25 : undefined;
  const crit = flags.filter((f) => f.severity === "critical");
  const warns = flags.filter((f) => f.severity !== "critical");
  const brand = settings.data?.brand_active;
  const voice = settings.data?.voice_default;
  const nearest = v?.uniqueness_json?.nearest ? byId[v.uniqueness_json.nearest] : null;
  const timelineVideo: any[] = v?.storyboard?.timeline_json?.tracks?.video || [];

  return (
    <>
      {/* ---------------- hàng cấu hình (thông tin thật, chỉ đọc) */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12 }}>
        <Info label="Nguồn nội dung" icon={<Layers size={14} />} value="Product Brain" onClick={() => nav("/brain")} />
        <Info label="Sản phẩm" icon={<Package size={14} />} value={product?.name || "—"} onClick={() => nav("/brain")} />
        <Info label="Độ dài video mục tiêu" icon={<Clock size={14} />} value={duration ? `${duration} giây` : "—"} />
        <Info label="Giọng đọc mặc định" icon={<Mic size={14} />} value={voice ? `${voice.voice} · ${voice.rate}x` : "—"} onClick={() => nav("/creative/voice")} />
        <Info label="Số lượng concept" icon={<Users size={14} />} value={`${items.length} biến thể`} onClick={() => nav("/creative/matrix")} />
        <Info label="Tông giọng thương hiệu" icon={<ShieldCheck size={14} />} value={brand?.tone || "—"} onClick={() => nav("/system/brand")} />
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "280px minmax(0, 1fr) 330px", alignItems: "start" }}>
        {/* ---------------- danh sách kịch bản */}
        <Card title={`Danh sách kịch bản (${items.filter((x) => x.script).length})`} style={{ padding: 12 }}>
          <div className="search" style={{ margin: 0, maxWidth: "none", height: 34 }}>
            <Search size={14} /><input placeholder="Tìm ID, hook, góc nhìn…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col mt12" style={{ gap: 8, maxHeight: 640, overflowY: "auto", paddingRight: 2 }}>
            {list.length === 0 && <div className="small muted">Không tìm thấy.</div>}
            {list.map((x) => (
              <div key={x.id} className={`list-item ${x.id === id ? "on" : ""}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 4 }} onClick={() => select(x.id)}>
                <div className="row" style={{ width: "100%" }}>
                  <b className="small">{x.code}</b>
                  <span className="small ellipsis grow">{x.script?.title || <span className="muted">Chưa có kịch bản</span>}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <VariantStatus status={x.status} />
                  {x.script?.flags ? <Badge tone="red">{x.script.flags} cờ</Badge> : null}
                </div>
                <div className="xs muted">Góc nhìn: {x.angle_label} · {x.audience_label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* ---------------- editor */}
        <div className="card" style={{ minHeight: 400 }}>
          {vq.loading && !v ? <Loading rows={8} /> : vq.error && !v ? <ErrorBox error={vq.error} onRetry={vq.reload} /> : !v ? null : (
            <>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <FileText size={18} className="c-primary" style={{ marginTop: 3 }} />
                <div className="grow">
                  <div className="card-title">{v.code} – {s?.title || "Chưa có kịch bản"}</div>
                  <div className="xs muted">{v.angle_label} · {v.audience_label} · {v.narrative_label} · {v.format_label}</div>
                </div>
                {s && <Badge tone={SCRIPT_STATUS[s.status]?.tone || "gray"}>{SCRIPT_STATUS[s.status]?.label || s.status}</Badge>}
                <VariantStatus status={v.status} />
                <Btn size="sm" icon={<History size={13} />} onClick={() => setHistOpen(true)} disabled={!s} title={!s ? "Chưa có phiên bản" : undefined}>Lịch sử phiên bản</Btn>
              </div>

              {s && (
                <div className="row wrap mt12" style={{ gap: 8 }}>
                  <span className="chip"><Clock size={13} /> Độ dài đề xuất: {duration}s</span>
                  <span className="chip"><Clapperboard size={13} /> Số cảnh: {beats.length}</span>
                  <span className="chip"><Type size={13} /> Tổng số từ: {totalWords}</span>
                  <span className="chip"><Clock size={13} /> Ước tính: {sec(est)}</span>
                  {inLimit !== undefined && <Badge tone={inLimit ? "teal" : "orange"} icon={inLimit ? <Check size={12} /> : undefined}>{inLimit ? "Trong giới hạn" : "Dài hơn mục tiêu"}</Badge>}
                  <Badge tone={s.engine?.startsWith("ollama") ? "purple" : s.engine === "manual" ? "cyan" : "gray"} icon={s.engine?.startsWith("ollama") ? <Bot size={12} /> : <Cpu size={12} />}>
                    {s.engine?.startsWith("ollama") ? s.engine : s.engine === "manual" ? "Chỉnh tay" : "Template engine"}
                  </Badge>
                </div>
              )}

              <div className="mt12">
                <Tabs value={tab} onChange={setTab} tabs={[
                  { id: "script", label: "Kịch bản" },
                  { id: "hooks", label: `Hook thay thế (${s?.beats_json?.hooks?.length || 0})` },
                  { id: "refs", label: `Tài liệu tham chiếu (${citations.length})` },
                  { id: "product", label: "Thông tin sản phẩm" },
                ]} />
              </div>

              {genBusy && (
                <div className="info-box small mb12"><RefreshCw size={15} className="spin c-cyan" /> AI local (Ollama) đang viết phiên bản mới… thường mất 20–60 giây. Có thể chuyển màn hình — kết quả vẫn được lưu.</div>
              )}

              {tab === "script" && (!s ? (
                <Empty title="Biến thể chưa có kịch bản" action={<Btn kind="primary" icon={<Sparkles size={15} />} loading={genBusy} onClick={regenerate}>Sinh kịch bản bằng AI</Btn>}>
                  Kịch bản chỉ dùng claim đã duyệt trong Product Brain.
                </Empty>
              ) : edit ? (
                <BeatEditor edit={edit} setEdit={setEdit} claims={pq.data?.claims || []} onSave={saveEdit} onCancel={() => setEdit(null)} status={v.status} />
              ) : (
                <>
                  <div className="col" style={{ gap: 0 }}>
                    {beats.map((b, i) => {
                      const m = BEAT_META[b.type] || BEAT_META.body;
                      const bf = flags.filter((f) => f.beat === i);
                      return (
                        <div key={i} className="row" style={{ alignItems: "stretch", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
                          <div style={{ width: 92, flexShrink: 0 }}>
                            <Badge tone={m.tone}>{m.label}</Badge>
                            <div className="xs muted mt8">{sec(b.start)} – {sec(b.end)}</div>
                            <div className="xs muted">≈ {words(b.text).length} từ</div>
                          </div>
                          <div className="grow">
                            <div style={{ lineHeight: 1.55 }}>{b.text}</div>
                            {b.on_screen && <div className="small mt8"><span className="muted">Chữ trên màn hình:</span> <b>{b.on_screen}</b></div>}
                            <div className="row wrap mt8" style={{ gap: 6 }}>
                              {(b.claim_ids || []).map((cid: string) => {
                                const cl = claimsById[cid];
                                return <Badge key={cid} tone={cl?.status === "approved" ? "teal" : "red"}>Claim {citations.indexOf(cid) + 1}{cl ? "" : " (không tồn tại)"}</Badge>;
                              })}
                              {bf.map((f, k) => <Badge key={k} tone={f.severity === "critical" ? "red" : "orange"}>{f.code}</Badge>)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="row mt8">
                    <Btn size="sm" icon={<Pencil size={13} />} onClick={() => setEdit({ title: s.title, beats: beats.map((b) => ({ ...b, claim_ids: [...(b.claim_ids || [])], shot_tags: [...(b.shot_tags || [])] })) })}>Chỉnh sửa inline</Btn>
                    <span className="xs muted">Lưu sẽ tạo phiên bản mới, chạy lại kiểm tra claim.</span>
                  </div>

                  <div className="card-title mt16" style={{ fontSize: 14 }}><Clapperboard size={15} className="c-primary" /> Bảng phân cảnh (Shot mapping)</div>
                  <div className="table-wrap mt8">
                    <table className="tbl">
                      <thead><tr><th>Cảnh</th><th>Thời lượng</th><th>Nội dung hình ảnh gợi ý</th><th>Chữ hiển thị</th><th>Cảnh quay gán</th></tr></thead>
                      <tbody>
                        {beats.map((b, i) => {
                          const clip = timelineVideo[i];
                          const sc = clip ? scenesById[clip.scene_id] : null;
                          return (
                            <tr key={i}>
                              <td className="bold">{i + 1}</td>
                              <td className="small">{sec(b.start)} – {sec(b.end)}</td>
                              <td className="small">{b.visual || "—"}<div className="xs muted">{(b.shot_tags || []).map((t: string) => SHOT_TAGS[t] || t).join(" · ")}</div></td>
                              <td className="small">{b.on_screen || "—"}</td>
                              <td className="small">
                                {sc ? <div className="row"><Thumb src={sc.keyframe} ratio="9/16" style={{ width: 26 }} /><span>{sc.label}{clip.fallback ? <Badge tone="orange">thay thế</Badge> : null}</span></div>
                                  : <span className="muted">{v.storyboard ? "—" : "Chưa dựng storyboard"}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ))}

              {tab === "hooks" && (
                <div className="col" style={{ gap: 8 }}>
                  {(s?.beats_json?.hooks || []).length === 0 && <div className="small muted">Không có hook thay thế.</div>}
                  {(s?.beats_json?.hooks || []).map((h: string, i: number) => (
                    <div key={i} className="inner row">
                      <Badge tone="purple">#{i + 1}</Badge><span className="grow">{h}</span>
                      {beats[0]?.text === h ? <Badge tone="teal">Đang dùng</Badge> : (
                        <Btn size="xs" onClick={async () => {
                          const nb = beats.map((b, k) => (k === 0 ? { ...b, text: h } : b));
                          try { await api.put(`/variants/${id}/script`, { title: s.title, beats: nb }); toast({ kind: "success", title: "Đã thay hook (phiên bản mới)" }); reloadAll(); return true; } catch (e) { toastError(e); }
                        }}>Dùng hook này</Btn>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === "refs" && (
                <div className="col" style={{ gap: 8 }}>
                  {citations.length === 0 && <div className="small muted">Kịch bản không trích dẫn claim nào.</div>}
                  {citations.map((cid, i) => {
                    const cl = claimsById[cid];
                    const ev = cl?.evidence_id ? evidenceById[cl.evidence_id] : null;
                    return (
                      <div key={cid} className="inner">
                        <div className="row"><Badge tone="purple">{i + 1}</Badge><span className="grow">{cl?.text || `Claim ${cid.slice(0, 8)} không tồn tại`}</span>{cl && <Badge tone={CLAIM_STATUS[cl.status]?.tone}>{CLAIM_STATUS[cl.status]?.label}</Badge>}</div>
                        <div className="xs muted mt8">Bằng chứng: {ev ? (ev.title || ev.source || ev.uri || ev.id) : "Chưa gắn evidence"}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === "product" && (
                pq.loading && !pq.data ? <Loading /> : pq.data ? (
                  <div className="kv">
                    <span>Tên</span><span>{pq.data.product.name}</span>
                    {Object.entries(pq.data.product.attributes_json || {}).map(([k, val]) => (
                      <FragmentKV key={k} k={k} v={Array.isArray(val) ? val.join(", ") : String(val)} />
                    ))}
                  </div>
                ) : <div className="small muted">Chưa có Product Brain.</div>
              )}
            </>
          )}
        </div>

        {/* ---------------- cột phải: kiểm chứng */}
        <div className="col" style={{ gap: 16 }}>
          <Card title="Kiểm chứng thông tin & tối ưu" style={{ padding: 14 }}>
            <div className="inner">
              <div className="row">
                {crit.length ? <ShieldAlert size={16} className="c-red" /> : <ShieldCheck size={16} className="c-teal" />}
                <b className="grow">Kiểm tra phát ngôn (Claim Check)</b>
                {s ? <Badge tone={crit.length ? "red" : warns.length ? "orange" : "teal"}>{crit.length ? "Chặn" : warns.length ? "Cảnh báo" : "Đạt"}</Badge> : <Badge>—</Badge>}
              </div>
              {!s ? <div className="small muted mt8">Chưa có kịch bản.</div> : flags.length === 0 ? (
                <div className="small t2 mt8">✓ Không phát hiện phát ngôn chưa được kiểm chứng. Mọi lợi ích đều dẫn claim đã duyệt.</div>
              ) : (
                <div className="col mt8" style={{ gap: 6 }}>
                  {flags.map((f, i) => (
                    <div key={i} className="small" style={{ borderLeft: `3px solid ${f.severity === "critical" ? "var(--red)" : "var(--orange)"}`, paddingLeft: 8 }}>
                      <b className={f.severity === "critical" ? "c-red" : "c-orange"}>{f.code}</b>{f.beat !== null && f.beat !== undefined ? ` · beat ${f.beat + 1}` : ""}
                      <div className="t2">{f.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-title mt16" style={{ fontSize: 14 }}><BookOpen size={15} className="c-cyan" /> Nguồn trích dẫn ({citations.length})</div>
            <div className="col mt8" style={{ gap: 6 }}>
              {citations.length === 0 && <div className="small muted">Không có trích dẫn.</div>}
              {citations.map((cid, i) => (
                <div key={cid} className="row small" style={{ alignItems: "flex-start" }}>
                  <Badge tone="purple">{i + 1}</Badge>
                  <span className="t2 grow">{claimsById[cid]?.text || cid.slice(0, 8)}</span>
                </div>
              ))}
            </div>

            <div className="card-title mt16" style={{ fontSize: 14 }}><Layers size={15} className="c-orange" /> Cảnh báo kịch bản tương tự</div>
            <div className="mt8">
              {v?.uniqueness_json?.max_similarity === undefined ? <div className="small muted">Chưa có dữ liệu tương đồng.</div> : (
                <div className="row">
                  <Ring value={v.uniqueness_json.max_similarity * 100} size={58} thickness={6} color={v.uniqueness_json.max_similarity >= 0.6 ? "#f5a524" : "#19d3b5"} />
                  <div className="small grow">
                    <div>Gần nhất: <b className="link" onClick={() => nearest && setSp((p) => { const n = new URLSearchParams(p); n.set("cmp", nearest.id); return n; }, { replace: true })}>{nearest?.code || "—"}</b> {nearest ? `(${nearest.angle_label})` : ""}</div>
                    <div className="muted">Cụm ngữ nghĩa: {v.similarity_group || "—"}</div>
                    {v.uniqueness_json.max_similarity >= 0.6 && <div className="c-orange">Nên đổi góc nhìn / hook để tăng khác biệt.</div>}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {approveErr && <ErrorBox error={approveErr} />}
          {approveErr?.body.code === "BLOCK-01" && (
            <Warn title="Các câu bị chặn">
              {((approveErr.body.details?.flags as any[]) || []).map((f, i) => <div key={i}>• Beat {(f.beat ?? 0) + 1}: {f.message}</div>)}
            </Warn>
          )}
        </div>
      </div>

      {v && <Compare a={v} items={items} cmp={sp.get("cmp")} setCmp={(b) => setSp((p) => { const n = new URLSearchParams(p); if (b) n.set("cmp", b); else n.delete("cmp"); return n; }, { replace: true })} />}

      <div className="sticky-bottom">
        <span className="small muted">{s ? `Phiên bản v${s.version} · ${dt(s.created_at)}` : ""}</span>
        <div style={{ marginLeft: "auto" }} />
        <Btn icon={<RefreshCw size={15} />} loading={genBusy} onClick={regenerate} disabled={!v} title="Gọi AI local (Ollama qwen3:8b) viết phiên bản mới — 20–60 giây">
          {s ? "Tạo bản khác có góc nhìn mới" : "Sinh kịch bản"}
        </Btn>
        <Btn kind="primary" icon={<Check size={15} />} onClick={approve} disabled={!s || v?.status !== "SCRIPT_READY" || !!edit}
          title={!s ? "Chưa có kịch bản" : v?.status !== "SCRIPT_READY" ? `Chỉ duyệt được khi ở trạng thái Chờ duyệt kịch bản (hiện: ${v?.status})` : undefined}>
          Duyệt kịch bản
        </Btn>
        <Btn icon={<Clapperboard size={15} />} onClick={storyboard} disabled={!v || !CAN_STORYBOARD.includes(v.status)}
          title={v && !CAN_STORYBOARD.includes(v.status) ? "Kịch bản cần được duyệt trước khi dựng storyboard" : undefined}>
          Tạo storyboard
        </Btn>
      </div>

      <HistoryModal open={histOpen} onClose={() => setHistOpen(false)} versions={hq.data || []} loading={hq.loading} current={s} />
    </>
  );
}

function FragmentKV({ k, v }: { k: string; v: string }) {
  const L: Record<string, string> = { category: "Danh mục", short_description: "Mô tả", usp: "USP", price: "Giá", features: "Đặc điểm", usage: "Cách dùng", limitations: "Giới hạn", audience: "Khách hàng", allowed_cta: "CTA cho phép", evidence_note: "Ghi chú bằng chứng", blocked_phrases: "Cụm từ cấm" };
  return <><span>{L[k] || k}</span><span className="t2">{v || "—"}</span></>;
}

function Info({ label, icon, value, onClick }: { label: string; icon: JSX.Element; value: string; onClick?: () => void }) {
  return (
    <div className="field" style={{ cursor: onClick ? "pointer" : undefined }} onClick={onClick} title={onClick ? "Mở màn hình cấu hình" : undefined}>
      <span className="label">{label}</span>
      <div className="select row" style={{ backgroundImage: "none" }}><span className="c-primary">{icon}</span><span className="ellipsis small">{value}</span></div>
    </div>
  );
}

function BeatEditor({ edit, setEdit, claims, onSave, onCancel, status }: { edit: { title: string; beats: any[] }; setEdit: (e: any) => void; claims: any[]; onSave: () => Promise<unknown>; onCancel: () => void; status: string }) {
  const approved = claims.filter((c) => c.status === "approved");
  const setBeat = (i: number, p: any) => setEdit({ ...edit, beats: edit.beats.map((b, k) => (k === i ? { ...b, ...p } : b)) });
  let t = 0;
  return (
    <div className="col" style={{ gap: 10 }}>
      {!["DRAFT", "SCRIPT_READY", "NEEDS_REVISION"].includes(status) && (
        <Warn title="Biến thể đã qua bước duyệt kịch bản">Lưu sẽ tạo phiên bản mới ở trạng thái nháp; cần duyệt lại và dựng lại storyboard để áp dụng.</Warn>
      )}
      <label className="field"><span className="label">Tiêu đề</span><input className="input" value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
      {edit.beats.map((b, i) => {
        const m = BEAT_META[b.type] || BEAT_META.body;
        const d = Math.max(1.5, Math.round((words(b.text).length / 3) * 10) / 10);
        const start = t; t += d;
        return (
          <div key={i} className="inner">
            <div className="row">
              <select className="select" style={{ width: 100, height: 30 }} value={b.type} onChange={(e) => setBeat(i, { type: e.target.value })}>
                <option value="hook">HOOK</option><option value="body">BODY</option><option value="cta">CTA</option>
              </select>
              <span className="xs muted">≈ {sec(start)} – {sec(t)} · {words(b.text).length} từ</span>
              <span style={{ marginLeft: "auto" }} />
              <button className="icon-btn" title="Xoá beat" onClick={() => setEdit({ ...edit, beats: edit.beats.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
            </div>
            <textarea className="textarea mt8" rows={2} value={b.text} style={{ borderColor: m.color }} onChange={(e) => setBeat(i, { text: e.target.value })} placeholder="Lời thoại" />
            <div className="grid g2 mt8" style={{ gap: 8 }}>
              <input className="input" placeholder="Chữ trên màn hình (≤ 8 từ)" value={b.on_screen || ""} onChange={(e) => setBeat(i, { on_screen: e.target.value })} />
              <input className="input" placeholder="Mô tả cảnh" value={b.visual || ""} onChange={(e) => setBeat(i, { visual: e.target.value })} />
            </div>
            <div className="row wrap mt8" style={{ gap: 6 }}>
              <span className="xs muted">Claim:</span>
              {approved.length === 0 && <span className="xs muted">Không có claim đã duyệt</span>}
              {approved.map((c, k) => {
                const on = (b.claim_ids || []).includes(c.id);
                return <span key={c.id} className={`chip ${on ? "on" : ""}`} title={c.text} onClick={() => setBeat(i, { claim_ids: on ? b.claim_ids.filter((x: string) => x !== c.id) : [...(b.claim_ids || []), c.id] })}>{on ? "✓ " : ""}C{k + 1} · {c.text.slice(0, 26)}{c.text.length > 26 ? "…" : ""}</span>;
              })}
            </div>
            <div className="row wrap mt8" style={{ gap: 6 }}>
              <span className="xs muted">Shot:</span>
              {Object.entries(SHOT_TAGS).map(([k, lbl]) => {
                const on = (b.shot_tags || []).includes(k);
                return <span key={k} className={`chip ${on ? "on" : ""}`} style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setBeat(i, { shot_tags: on ? b.shot_tags.filter((x: string) => x !== k) : [...(b.shot_tags || []), k] })}>{lbl}</span>;
              })}
            </div>
          </div>
        );
      })}
      <div className="row">
        <Btn size="sm" icon={<Plus size={13} />} onClick={() => { const cta = edit.beats.findIndex((b) => b.type === "cta"); const nb = [...edit.beats]; nb.splice(cta < 0 ? nb.length : cta, 0, { type: "body", text: "", on_screen: "", visual: "", claim_ids: [], shot_tags: [] }); setEdit({ ...edit, beats: nb }); }}>Thêm beat</Btn>
        <span style={{ marginLeft: "auto" }} />
        <Btn kind="ghost" icon={<X size={14} />} onClick={onCancel}>Huỷ</Btn>
        <Btn kind="primary" icon={<Check size={14} />} onClick={onSave}>Lưu phiên bản mới</Btn>
      </div>
    </div>
  );
}

/** Diff từ đơn giản (LCS) để so sánh phiên bản. */
function diffWords(a: string, b: string): Array<{ t: string; k: "same" | "add" | "del" }> {
  const A = words(a), B = words(b);
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ t: string; k: "same" | "add" | "del" }> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: A[i], k: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: A[i++], k: "del" });
    else out.push({ t: B[j++], k: "add" });
  }
  while (i < n) out.push({ t: A[i++], k: "del" });
  while (j < m) out.push({ t: B[j++], k: "add" });
  return out;
}

function HistoryModal({ open, onClose, versions, loading, current }: { open: boolean; onClose: () => void; versions: any[]; loading: boolean; current: any }) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (open) setSel(versions[1]?.id || versions[0]?.id || null); }, [open, versions]);
  const old = versions.find((x) => x.id === sel);
  const ob: any[] = old?.beats_json?.beats || [];
  const cb: any[] = current?.beats_json?.beats || [];
  return (
    <Modal open={open} onClose={onClose} title={<><History size={16} /> Lịch sử phiên bản</>} width={900}>
      {loading && !versions.length ? <Loading /> : (
        <div className="grid" style={{ gridTemplateColumns: "220px 1fr" }}>
          <div className="col" style={{ gap: 6 }}>
            {versions.map((x) => (
              <div key={x.id} className={`list-item ${x.id === sel ? "on" : ""}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }} onClick={() => setSel(x.id)}>
                <div className="row"><b>v{x.version}</b>{x.id === current?.id && <Badge tone="teal">Hiện tại</Badge>}<Badge tone={SCRIPT_STATUS[x.status]?.tone || "gray"}>{SCRIPT_STATUS[x.status]?.label || x.status}</Badge></div>
                <div className="xs muted">{dt(x.created_at)} · {x.engine}</div>
              </div>
            ))}
          </div>
          <div>
            {!old ? <div className="small muted">Chọn phiên bản.</div> : (
              <>
                <div className="small t2 mb8">So sánh v{old.version} → v{current?.version} (hiện tại). <span style={{ background: "rgba(25,211,181,.2)", padding: "0 4px" }}>thêm</span> <span style={{ background: "rgba(240,80,110,.2)", textDecoration: "line-through", padding: "0 4px" }}>xoá</span></div>
                {old.title !== current?.title && <div className="small mb8">Tiêu đề: <s className="c-red">{old.title}</s> → <b className="c-teal">{current?.title}</b></div>}
                <div className="col" style={{ gap: 8 }}>
                  {Array.from({ length: Math.max(ob.length, cb.length) }).map((_, i) => {
                    const a = ob[i], b = cb[i];
                    return (
                      <div key={i} className="inner small" style={{ lineHeight: 1.6 }}>
                        <Badge tone={BEAT_META[(b || a).type]?.tone || "gray"}>{BEAT_META[(b || a).type]?.label || (b || a).type}</Badge>{" "}
                        {diffWords(a?.text || "", b?.text || "").map((w, k) => (
                          <span key={k} style={w.k === "add" ? { background: "rgba(25,211,181,.2)", color: "#7ff0dc" } : w.k === "del" ? { background: "rgba(240,80,110,.2)", textDecoration: "line-through", color: "#ff8aa1" } : undefined}>{w.t} </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="small mt12 muted">Cờ claim: v{old.version} có {(old.beats_json?.flags || []).length} · hiện tại {(current?.beats_json?.flags || []).length}</div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Compare({ a, items, cmp, setCmp }: { a: any; items: any[]; cmp: string | null; setCmp: (b: string | null) => void }) {
  const withScript = items.filter((x) => x.script && x.id !== a.id);
  const b = cmp && cmp !== a.id ? cmp : a.uniqueness_json?.nearest && a.uniqueness_json.nearest !== a.id ? a.uniqueness_json.nearest : withScript[0]?.id || null;
  const q = useApi<any>(a.script && b ? "/variants/compare" : null, { a: a.id, b });
  const d = q.data;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <Card className="mt16" title="So sánh kịch bản" icon={<GitCompare size={16} className="c-primary" />} sub="Xem nhanh điểm giống, khác và giá trị bổ sung giữa hai kịch bản.">
      {!a.script ? <div className="small muted">Biến thể hiện tại chưa có kịch bản để so sánh.</div> : !b ? <div className="small muted">Cần ít nhất 2 biến thể có kịch bản.</div> : (
        <div className="grid" style={{ gridTemplateColumns: "280px 1fr 220px", alignItems: "start" }}>
          <div className="col">
            <label className="field"><span className="label">Kịch bản A</span><div className="select row" style={{ backgroundImage: "none" }}><span className="ellipsis small">{a.code} – {a.script.title}</span></div></label>
            <label className="field"><span className="label">Kịch bản B</span>
              <select className="select" value={b} onChange={(e) => setCmp(e.target.value)}>
                {withScript.map((x) => <option key={x.id} value={x.id}>{x.code} – {x.script.title}</option>)}
              </select>
            </label>
          </div>
          <div>
            {q.loading && !d ? <Loading rows={3} /> : q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : d && (
              <div className="table-wrap">
                <table className="tbl">
                  <tbody>
                    <tr><td className="muted">Tương đồng hook</td><td>{pct(d.hook_similarity)}</td><td className="muted">Cùng góc nhìn</td><td>{d.same_angle ? <Badge tone="orange">Có · {d.a.angle_label}</Badge> : <Badge tone="teal">Khác: {d.a.angle_label} / {d.b.angle_label}</Badge>}</td></tr>
                    <tr><td className="muted">Cấu trúc beat</td><td>{d.same_structure ? <Badge tone="orange">Giống hệt</Badge> : <Badge tone="teal">Khác</Badge>}</td><td className="muted">Trùng cảnh quay</td><td>{pct(d.scene_overlap)}</td></tr>
                    <tr><td className="muted">Hook A</td><td colSpan={3} className="small">{d.a.script?.hook || "—"}</td></tr>
                    <tr><td className="muted">Hook B</td><td colSpan={3} className="small">{d.b.script?.hook || "—"}</td></tr>
                    <tr><td className="muted">Khách hàng</td><td colSpan={3} className="small">{d.a.audience_label} / {d.b.audience_label} · {d.a.narrative_label} / {d.b.narrative_label}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="inner center">
            <div className="small t2">Độ tương đồng ngữ nghĩa</div>
            <div className="bold c-primary" style={{ fontSize: 34 }}>{d ? pct(d.script_similarity) : "—"}</div>
            <div className="xs muted">Chỉ số nội bộ (cosine từ), phục vụ quản trị nội dung</div>
            {d && <div className="mt8">{d.script_similarity >= 0.6 ? <Badge tone="orange">Nên đa dạng hoá</Badge> : <Badge tone="teal" icon={<CheckCircle2 size={12} />}>Đủ khác biệt</Badge>}</div>}
          </div>
        </div>
      )}
    </Card>
  );
}
