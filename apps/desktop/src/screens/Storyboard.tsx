import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Camera, CheckCircle2, ClipboardList, Clock, Copy, Download, Film, Layers, LayoutTemplate, Mic, Pause, Play, Save, Sparkles, Target, Video, Clapperboard, AlertTriangle, FileText,
} from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { SHOT_TAGS, fileName, ms } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Modal, NeedProject, PageHead, Thumb, Toggle, VariantStatus, Warn } from "../components/ui";
import { useSelectedVariant, useVariants, VariantSelect } from "../components/pickers";
import { BEAT_META, MOTION_LABEL } from "../components/b_creative";

const HAS_SB = ["STORYBOARD_READY", "PREVIEW_READY", "QC_PENDING", "APPROVED", "RENDERING", "COMPLETED", "FAILED"];
const CAN_BUILD = ["SCRIPT_APPROVED", "STORYBOARD_READY", "PREVIEW_READY", "FAILED", "NEEDS_REVISION"];
const PURPOSE: Record<string, string> = { hook: "Gây chú ý, nêu vấn đề", body: "Truyền tải thông tin / chứng minh", cta: "Kêu gọi hành động" };
const FOOT_FILTERS = [
  { id: "all", label: "Tất cả", tags: [] as string[] },
  { id: "product", label: "Sản phẩm", tags: ["packshot", "packaging", "close_up"] },
  { id: "people", label: "Người dùng", tags: ["face", "presenter"] },
  { id: "demo", label: "Thao tác", tags: ["demonstration", "hand"] },
  { id: "cta", label: "CTA", tags: ["cta"] },
];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function Storyboard() {
  const { projectId, campaign } = useApp();
  const nav = useNavigate();
  const all = useVariants(undefined, 8000);
  const items = all.data?.items;
  const { id, select } = useSelectedVariant(items, (v) => HAS_SB.includes(v.status));
  return (
    <NeedProject projectId={projectId}>
      <PageHead title="Storyboard AI" icon={<Clapperboard size={22} />}
        sub="Lập kế hoạch cảnh quay, sắp xếp mạch kể chuyện và chuẩn bị tư liệu để dựng video quảng bá sản phẩm."
        actions={items?.length ? <VariantSelect items={items} value={id} onChange={select} /> : undefined} />
      {!campaign ? (
        <Empty title="Chưa có chiến dịch" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Thiết lập chiến lược</Btn>} />
      ) : all.loading && !items ? <Loading rows={6} /> : all.error && !items ? <ErrorBox error={all.error} onRetry={all.reload} /> : !items?.length ? (
        <Empty title="Chưa có biến thể nào" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Đi tới Chiến lược nội dung</Btn>} />
      ) : id ? <Board key={id} vid={id} projectId={projectId!} reloadList={all.reload} /> : null}
    </NeedProject>
  );
}

function Board({ vid, projectId, reloadList }: { vid: string; projectId: string; reloadList: () => void }) {
  const nav = useNavigate();
  const { toast, toastError } = useApp();
  const vq = useApi<any>(`/variants/${vid}`);
  const scenesQ = useApi<any[]>("/scenes", { project_id: projectId });
  const tq = useApi<any[]>("/templates");
  const [tl, setTl] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState(0);
  const [foot, setFoot] = useState("all");
  const [shotOpen, setShotOpen] = useState(false);

  const v = vq.data;
  const sb = v?.storyboard;
  useEffect(() => { if (sb && !dirty) setTl(clone(sb.timeline_json)); /* eslint-disable-next-line */ }, [sb?.id]);

  const scenes = scenesQ.data || [];
  const scenesById = useMemo(() => Object.fromEntries(scenes.map((s) => [s.id, s])), [scenes]);
  const beats: any[] = v?.script_full?.beats_json?.beats || [];

  if (vq.loading && !v) return <Loading rows={8} />;
  if (vq.error && !v) return <ErrorBox error={vq.error} onRetry={vq.reload} />;
  if (!v) return null;

  if (!sb || !tl) {
    const can = CAN_BUILD.includes(v.status);
    return (
      <Empty title={`${v.code} chưa có storyboard`}
        action={can ? (
          <Btn kind="primary" icon={<Sparkles size={15} />} onClick={async () => {
            try { await api.post(`/variants/${vid}/storyboard`); toast({ kind: "success", title: "Đã dựng storyboard" }); vq.reload(); reloadList(); return true; } catch (e) { toastError(e, "Không dựng được storyboard"); }
          }}>Dựng storyboard từ kịch bản</Btn>
        ) : <Btn kind="primary" onClick={() => nav(`/creative/scripts?v=${vid}`)}>Mở Nhà máy kịch bản</Btn>}>
        {can ? "Kịch bản đã duyệt — AI sẽ ghép cảnh quay thật theo nhãn shot của từng beat." : <>Trạng thái hiện tại: <VariantStatus status={v.status} />. Kịch bản cần được duyệt trước khi dựng storyboard.</>}
      </Empty>
    );
  }

  const captions: any[] = tl.tracks.captions || [];
  const video: any[] = tl.tracks.video || [];
  const titles: any[] = tl.tracks.titles || [];
  const voice: any[] = tl.tracks.voice || [];
  const clipIdx = (i: number) => (video.length === captions.length ? i : video.findIndex((c) => c.start_ms === captions[i]?.start_ms));
  const clipOf = (i: number) => { const k = clipIdx(i); return k >= 0 ? video[k] : undefined; };
  const gaps: any[] = tl.gaps || [];
  const covered = captions.filter((_, i) => { const c = clipOf(i); return c && !c.fallback; }).length;
  const template = (tq.data || []).find((t) => t.id === tl.template_id);
  const flagsCount = (v.script_full?.beats_json?.flags || []).length;

  const mutate = (fn: (t: any) => void) => { const n = clone(tl); fn(n); setTl(n); setDirty(true); };

  function assignScene(i: number, sc: any) {
    mutate((t) => {
      const cap = t.tracks.captions[i];
      const dur = cap.end_ms - cap.start_ms;
      const sLen = sc.end_ms - sc.start_ms;
      const srcIn = sc.start_ms + (sLen > dur ? Math.floor((sLen - dur) / 2) : 0);
      const clip = { scene_id: sc.id, asset_id: sc.asset_id, src_in_ms: srcIn, src_out_ms: srcIn + Math.min(dur, sLen), start_ms: cap.start_ms, end_ms: cap.end_ms, loop: sLen < dur, fallback: false };
      const vids = t.tracks.video;
      const k = vids.length === t.tracks.captions.length ? i : vids.findIndex((c: any) => c.start_ms === cap.start_ms);
      if (k >= 0) vids[k] = { ...vids[k], ...clip, start_ms: vids[k].start_ms, end_ms: vids[k].end_ms };
      else { vids.push({ ...clip, motion: "none" }); vids.sort((a: any, b: any) => a.start_ms - b.start_ms); }
      t.gaps = (t.gaps || []).filter((g: any) => g.beat !== i);
    });
  }

  async function save() {
    try {
      await api.put(`/variants/${vid}/timeline`, tl);
      setDirty(false);
      toast({ kind: "success", title: "Đã lưu storyboard (phiên bản mới)" });
      vq.reload();
      return true;
    } catch (e) {
      toastError(e, "Không lưu được timeline");
      throw e;
    }
  }

  async function toTimeline() {
    try {
      if (dirty) await save();
      const j = await api.post(`/variants/${vid}/voice`, {});
      toast({ kind: "success", title: "Đã đưa giọng đọc vào hàng đợi", body: `Job ${String(j.id).slice(0, 8)} — timeline sẽ đồng bộ theo giọng thật` });
      nav(`/production/editor?v=${vid}`);
    } catch (e) {
      toastError(e, "Không tạo được timeline dựng phim");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ variant: v.code, script: v.script_full?.title, timeline: tl }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `storyboard_${v.code}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const cap = captions[sel];
  const clip = clipOf(sel);
  const scene = clip ? scenesById[clip.scene_id] : undefined;
  const beat = beats[cap?.beat ?? sel];
  const title = titles.find((t) => t.beat === (cap?.beat ?? sel));
  const fdef = FOOT_FILTERS.find((f) => f.id === foot)!;
  const footList = scenes.filter((s) => !fdef.tags.length || (s.tags_json || []).some((t: string) => fdef.tags.includes(t)));

  return (
    <>
      <div className="row mb12" style={{ justifyContent: "flex-end", marginTop: -8 }}>
        {dirty && <Badge tone="orange">Có thay đổi chưa lưu</Badge>}
        <Btn size="sm" icon={<Save size={14} />} onClick={save} disabled={!dirty} title={!dirty ? "Không có thay đổi" : undefined}>Lưu nháp</Btn>
        <Btn size="sm" icon={<Download size={14} />} onClick={exportJson}>Xuất storyboard (JSON)</Btn>
      </div>

      <div className="card row wrap" style={{ gap: 10, padding: "12px 16px" }}>
        <b style={{ fontSize: 15 }}>Tổng quan mạch chuyện</b>
        <span className="chip"><Video size={13} /> Video: {Math.round(tl.duration_ms / 1000)} giây</span>
        <span className="chip"><Layers size={13} /> {captions.length} cảnh</span>
        <span className="chip"><Target size={13} /> {v.angle_label} · {v.audience_label}</span>
        <span className="chip"><LayoutTemplate size={13} /> {template ? `${template.name} v${tl.template_version}` : "Template mặc định"}</span>
        <span className="chip"><FileText size={13} /> Kịch bản v{tl.script_version ?? "—"} · Storyboard v{sb.version}</span>
        <span className="chip">{voice.length ? <><Mic size={13} className="c-teal" /> Đã có giọng đọc</> : <><Mic size={13} /> Chưa có giọng đọc</>}</span>
        <span style={{ marginLeft: "auto" }} />
        {flagsCount === 0 ? <Badge tone="teal" icon={<CheckCircle2 size={12} />}>Nội dung đã xác thực claim</Badge> : <Badge tone="red">{flagsCount} cờ claim</Badge>}
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px", alignItems: "start" }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {captions.map((c, i) => {
            const cl = clipOf(i);
            const sc = cl ? scenesById[cl.scene_id] : undefined;
            const b = beats[c.beat ?? i];
            const m = BEAT_META[b?.type] || BEAT_META.body;
            const gap = gaps.find((g) => g.beat === i);
            return (
              <div key={i} className={`card ${sel === i ? "glow" : ""}`} style={{ padding: 10, cursor: "pointer" }} onClick={() => setSel(i)}>
                <div className="row small">
                  <Badge tone={m.tone}>{String(i + 1).padStart(2, "0")}</Badge>
                  <b className="ellipsis grow">{b?.on_screen || m.label}</b>
                  <span className="xs muted"><Clock size={11} /> {ms(c.start_ms)}–{ms(c.end_ms)}</span>
                </div>
                <Thumb src={sc?.keyframe} ratio="16/10" style={{ marginTop: 8 }} label={cl?.fallback || gap ? <Badge tone="orange">Cảnh thay thế</Badge> : undefined}
                  duration={`${((c.end_ms - c.start_ms) / 1000).toFixed(1)}s`} />
                <div className="col mt8" style={{ gap: 3 }}>
                  <div className="xs"><span className="muted">VO:</span> “{c.text}”</div>
                  <div className="xs"><span className="muted">Mục đích:</span> {PURPOSE[b?.type] || "—"}</div>
                  <div className="xs"><span className="muted">Chuyển cảnh:</span> {cl ? MOTION_LABEL[cl.motion] || cl.motion : "—"}{cl?.loop ? " · lặp" : ""}</div>
                  <div className="xs ellipsis"><span className="muted">Nguồn tư liệu:</span> {sc ? `${sc.file_name || fileName(sc.asset_id)} · ${ms(cl.src_in_ms)}–${ms(cl.src_out_ms)} (${sc.label})` : <span className="c-orange">Chưa gán cảnh</span>}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ---------------- chi tiết cảnh */}
        <Card title={`Chi tiết cảnh (${String(sel + 1).padStart(2, "0")})`} sub={beat ? `${(BEAT_META[beat.type] || BEAT_META.body).label} · ${beat.visual || ""}` : undefined}
          right={<>
            <button className="btn xs" disabled={sel <= 0} onClick={() => setSel(sel - 1)}>‹</button>
            <button className="btn xs" disabled={sel >= captions.length - 1} onClick={() => setSel(sel + 1)}>›</button>
          </>}>
          {!cap ? <div className="small muted">Chọn một cảnh.</div> : (
            <div className="col" style={{ gap: 12 }}>
              <label className="field">
                <span className="label">Cảnh quay (từ thư viện)</span>
                <select className="select" value={clip?.scene_id || ""} onChange={(e) => { const s = scenesById[e.target.value]; if (s) assignScene(sel, s); }}>
                  {!clip && <option value="">— Chưa gán —</option>}
                  {scenes.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.file_name} · {ms(s.start_ms)}–{ms(s.end_ms)}</option>)}
                </select>
                {beat?.shot_tags?.length > 0 && <span className="xs muted">Cần: {beat.shot_tags.map((t: string) => SHOT_TAGS[t] || t).join(", ")}</span>}
              </label>
              {scene && (
                <div className="row inner" style={{ padding: 8 }}>
                  <Thumb src={scene.keyframe} ratio="9/16" style={{ width: 54 }} />
                  <div className="small grow">
                    <div className="semi ellipsis">{scene.file_name}</div>
                    <div className="xs muted">{ms(clip!.src_in_ms)} – {ms(clip!.src_out_ms)} · chất lượng {scene.quality_json?.score ?? "—"}</div>
                    <div className="row wrap mt8" style={{ gap: 4 }}>
                      {(scene.tags_json || []).slice(0, 4).map((t: string) => <Badge key={t} tone={beat?.shot_tags?.includes(t) ? "teal" : "gray"}>{SHOT_TAGS[t] || t}</Badge>)}
                    </div>
                  </div>
                </div>
              )}
              <div className="field">
                <span className="label">Thời lượng</span>
                <div className="select row" style={{ backgroundImage: "none" }}><Clock size={14} className="c-primary" />{((cap.end_ms - cap.start_ms) / 1000).toFixed(1)} giây ({ms(cap.start_ms)} – {ms(cap.end_ms)})</div>
                <span className="xs muted">Thời lượng theo lời thoại — tự đồng bộ khi tạo giọng đọc.</span>
              </div>
              <label className="field">
                <span className="label">Hiệu ứng chuyển động (Motion)</span>
                <select className="select" value={clip?.motion || "none"} disabled={!clip} onChange={(e) => mutate((t) => { const k = clipIdx(sel); if (k >= 0) t.tracks.video[k].motion = e.target.value; })}>
                  {Object.entries(MOTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <div className="field">
                <span className="label row between">Văn bản phủ (Overlay)
                  <Toggle purple on={!!title} onChange={(on) => mutate((t) => {
                    const bi = cap.beat ?? sel;
                    if (on) t.tracks.titles.push({ beat: bi, start_ms: cap.start_ms, end_ms: Math.min(cap.end_ms, cap.start_ms + 2500), text: beat?.on_screen || cap.text.slice(0, 40), style: beat?.type === "hook" ? "hook" : beat?.type === "cta" ? "cta" : "callout" });
                    else t.tracks.titles = t.tracks.titles.filter((x: any) => x.beat !== bi);
                  })} />
                </span>
                {title ? (
                  <>
                    <input className="input" value={title.text} onChange={(e) => mutate((t) => { const x = t.tracks.titles.find((y: any) => y.beat === title.beat); if (x) x.text = e.target.value; })} />
                    <select className="select" value={title.style} onChange={(e) => mutate((t) => { const x = t.tracks.titles.find((y: any) => y.beat === title.beat); if (x) x.style = e.target.value; })}>
                      <option value="hook">Kiểu Hook (lớn, giữa)</option><option value="callout">Callout</option><option value="cta">Kiểu CTA</option>
                    </select>
                  </>
                ) : <span className="xs muted">Không có chữ phủ cho cảnh này.</span>}
              </div>
              <div className="field">
                <span className="label">Giọng đọc (Voice track)</span>
                {voice[sel]?.uri ? <VoicePlay uri={voice[sel].uri} /> : <span className="xs muted">Chưa tạo giọng đọc — bấm “Tạo timeline dựng phim” để sinh.</span>}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ---------------- footage + gaps */}
      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0, 1fr) 330px 280px", alignItems: "stretch" }}>
        <Card title="Tư liệu nguồn (Footage)" right={<>
          {FOOT_FILTERS.map((f) => {
            const n = scenes.filter((s) => !f.tags.length || (s.tags_json || []).some((t: string) => f.tags.includes(t))).length;
            return <span key={f.id} className={`chip ${foot === f.id ? "on" : ""}`} onClick={() => setFoot(f.id)}>{f.label} ({n})</span>;
          })}
          <Btn size="sm" icon={<Camera size={13} />} onClick={() => nav("/media")}>+ Thêm tư liệu</Btn>
        </>}>
          {scenesQ.loading && !scenesQ.data ? <Loading rows={2} /> : footList.length === 0 ? <div className="small muted">Không có cảnh nào{foot !== "all" ? " khớp bộ lọc" : " — hãy nhập & phân tích video"}.</div> : (
            <div className="row" style={{ gap: 10, overflowX: "auto", paddingBottom: 4, alignItems: "flex-start" }}>
              {footList.map((s) => {
                const used = video.some((c) => c.scene_id === s.id);
                return (
                  <div key={s.id} style={{ width: 96, flexShrink: 0, cursor: "pointer" }} title={`Gán cho cảnh ${sel + 1}`} onClick={() => assignScene(sel, s)}>
                    <Thumb src={s.keyframe} ratio="9/16" duration={ms(s.end_ms - s.start_ms)} style={{ borderColor: clip?.scene_id === s.id ? "var(--primary)" : undefined }} />
                    <div className="xs mt8 row" style={{ gap: 4 }}>{used && <CheckCircle2 size={11} className="c-teal" />}<span className="ellipsis">{s.label}</span></div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="xs muted mt8">Bấm một cảnh để gán cho cảnh đang chọn ({String(sel + 1).padStart(2, "0")}).</div>
        </Card>

        <Card title={covered === captions.length ? `Đủ cảnh ${covered}/${captions.length}` : `Thiếu cảnh phù hợp (${covered}/${captions.length})`}
          icon={covered === captions.length ? <CheckCircle2 size={16} className="c-teal" /> : <AlertTriangle size={16} className="c-orange" />}>
          {gaps.length === 0 ? <div className="small t2">Mọi beat đều có cảnh quay thật khớp nhãn shot.</div> : (
            <div className="col" style={{ gap: 6 }}>
              {gaps.map((g, i) => (
                <div key={i} className="small" style={{ borderLeft: `3px solid ${g.code === "BLOCK-03" ? "var(--red)" : "var(--orange)"}`, paddingLeft: 8, cursor: "pointer" }} onClick={() => setSel(g.beat)}>
                  <b className={g.code === "BLOCK-03" ? "c-red" : "c-orange"}>{g.code}</b> · Cảnh {g.beat + 1}
                  <div className="t2">{g.message}</div>
                </div>
              ))}
              <Btn size="sm" kind="orange" icon={<ClipboardList size={13} />} onClick={() => setShotOpen(true)}>Lên kế hoạch quay bổ sung</Btn>
            </div>
          )}
        </Card>

        <div className="card col" style={{ justifyContent: "center", gap: 10 }}>
          <Btn kind="primary" size="lg" icon={<Film size={18} />} onClick={toTimeline}>Tạo timeline dựng phim <ArrowRight size={16} /></Btn>
          <div className="xs muted center">Lưu storyboard, đưa giọng đọc vào hàng đợi rồi mở Smart Video Editor.</div>
        </div>
      </div>

      <ShotList open={shotOpen} onClose={() => setShotOpen(false)} gaps={gaps} code={v.code} beats={beats} />
    </>
  );
}

function VoicePlay({ uri }: { uri: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <div className="row inner" style={{ padding: "6px 10px" }}>
      <Mic size={14} className="c-primary" />
      <span className="small grow ellipsis">{fileName(uri)}</span>
      <button className="icon-btn" onClick={() => { const a = ref.current; if (!a) return; if (a.paused) { a.play(); } else a.pause(); }}>{on ? <Pause size={15} /> : <Play size={15} />}</button>
      <audio ref={ref} src={fileUrl(uri)} onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => setOn(false)} />
    </div>
  );
}

function ShotList({ open, onClose, gaps, code, beats }: { open: boolean; onClose: () => void; gaps: any[]; code: string; beats: any[] }) {
  const { toast } = useApp();
  const rows = gaps.map((g, i) => ({ n: i + 1, beat: g.beat + 1, code: g.code, need: (beats[g.beat]?.shot_tags || []).map((t: string) => SHOT_TAGS[t] || t).join(", ") || "—", text: g.suggest_shot || g.message, vo: beats[g.beat]?.text || "" }));
  const txt = `Shot list quay bổ sung – ${code}\n` + rows.map((r) => `${r.n}. [${r.code}] Cảnh ${r.beat} – cần: ${r.need}\n   ${r.text}`).join("\n");
  return (
    <Modal open={open} onClose={onClose} title={<><ClipboardList size={16} /> Kế hoạch quay bổ sung – {code}</>} width={760}
      footer={<>
        <Btn icon={<Copy size={14} />} onClick={async () => { try { await navigator.clipboard.writeText(txt); toast({ kind: "success", title: "Đã sao chép shot list" }); } catch { toast({ kind: "warn", title: "Trình duyệt chặn clipboard" }); } }}>Sao chép</Btn>
        <Btn kind="primary" icon={<Download size={14} />} onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = `shotlist_${code}.txt`; a.click(); }}>Tải .txt</Btn>
      </>}>
      {rows.length === 0 ? <div className="small muted">Không có khoảng trống footage.</div> : (
        <>
          <Warn title="Thiếu footage thật cho các beat dưới đây">Hệ thống đang dùng cảnh thay thế. Quay bổ sung rồi nhập ở “Nguồn video” và phân tích lại để AI ghép đúng.</Warn>
          <div className="table-wrap mt12">
            <table className="tbl">
              <thead><tr><th>#</th><th>Cảnh</th><th>Mức</th><th>Shot cần quay</th><th>Gợi ý</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n}><td>{r.n}</td><td>{r.beat}</td><td><Badge tone={r.code === "BLOCK-03" ? "red" : "orange"}>{r.code}</Badge></td><td className="small">{r.need}</td><td className="small">{r.text}<div className="xs muted">VO: {r.vo}</div></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

